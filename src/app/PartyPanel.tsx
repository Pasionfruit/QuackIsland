/**
 * The party dashboard, under the perf HUD.
 *
 * What is going on, in the world, while you play: which game, which way, who
 * we are waiting on, and the host's way out of it.
 *
 * Getting *into* a game is the lobby popup's job, top left - make or join a
 * lobby, pick a game, ready up, start. Those controls were here as well until
 * there were two of everything, and two ready buttons is one too many.
 *
 * Lives in the app rather than in `10-party` because it reads across four
 * modules - who is in the lobby, who is ready, which game has been chosen, and
 * how - and the composition root is the one place allowed to.
 */
import { useNet, usePeers } from '../modules/09-net'
import { ME, canStart, disbandParty, setReady, startGame, useParty, waitingFor } from '../modules/10-party'
import { modeById, useGameMode } from '../modules/13-modes'
import { gardenModeById, needsPlayers, useGardenMode } from '../modules/14-garden'
import { MINIGAMES, openDashboard } from '../modules/15-minigames'

export function PartyPanel() {
  const net = useNet()
  const peers = usePeers()
  const party = useParty()
  const mode = useGameMode()
  const gardenMode = useGardenMode()

  const game = modeById(mode)
  // Everybody who has to be ready: the others, and you. The host readying up
  // is the same act as anybody else doing it.
  const everyone = [...peers.map((p) => p.id), ME]
  const waiting = waitingFor(everyone, party.ready)
  const way = mode === 'garden' ? gardenModeById(gardenMode).title : null
  const ready = party.ready.has(ME)
  const needed = mode === 'garden' ? needsPlayers(gardenMode) : 1
  const startable = canStart(party.phase, net.host, everyone, party.ready) && game.built && everyone.length >= needed

  if (mode === 'island' && party.phase === 'playing') return null

  return (
    <div style={panel}>
      <div style={heading}>PARTY</div>

      <div style={{ marginBottom: 5 }}>
        <span style={{ color: '#9fd8e6' }}>{game.title}</span>
        {way ? <span style={{ opacity: 0.6 }}> - {way}</span> : null}
      </div>

      {net.status !== 'joined' ? (
        <div style={{ opacity: 0.5 }}>open the lobby, top left</div>
      ) : (
        <>
          <div style={{ opacity: 0.6, marginBottom: 4 }}>
            {party.phase === 'playing'
              ? 'playing'
              : waiting === 0
                ? 'everybody ready'
                : `waiting on ${waiting}`}
          </div>

          {party.phase === 'gathering' ? (
            <div style={partyControls}>
              <button
                type="button"
                onClick={() => setReady(!ready)}
                style={{ ...button, ...readyButton(ready, waiting) }}
              >
                {ready ? 'cancel ready' : 'ready up'}
              </button>
              {net.host ? (
                <button
                  type="button"
                  onClick={startGame}
                  disabled={!startable}
                  style={{ ...button, ...startButton(startable) }}
                >
                  start party
                </button>
              ) : null}
              <span style={{ opacity: 0.48 }}>
                {waiting === 0
                  ? net.host ? 'everybody ready' : 'waiting for the host'
                  : `${waiting} of ${everyone.length} still to ready up`}
              </span>
            </div>
          ) : null}

          {/* The way out. The host's alone, because it sends everybody home
              and a guest ending everyone's party is not a thing to offer. */}
          {net.host ? (
            <button
              type="button"
              onClick={disbandParty}
              style={{ ...button, width: '100%', opacity: 0.8 }}
            >
              end the party
            </button>
          ) : null}
        </>
      )}

      {/* The minigames are Volcano Island's, so the way into the catalogue is
          offered when that is the game - and only to the host. Browsing is
          local, but starting is not: a guest goes where the host goes, so a
          catalogue would be offering them a choice they do not have. */}
      {mode === 'island' && net.host ? (
        <button
          type="button"
          onClick={openDashboard}
          style={{ ...button, width: '100%', marginTop: 5 }}
        >
          minigames · {MINIGAMES.length}
        </button>
      ) : null}
      {mode === 'island' && !net.host && net.status === 'joined' ? (
        <div style={{ opacity: 0.45, marginTop: 5 }}>the host picks the minigame</div>
      ) : null}

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

const partyControls: React.CSSProperties = {
  display: 'grid',
  gap: 5,
  margin: '7px 0',
}

function readyButton(ready: boolean, waiting: number): React.CSSProperties {
  const lit = ready || waiting > 0
  const danger = ready
  const colour = danger ? '#c8443c' : '#e0a05a'
  return {
    width: '100%',
    background: lit ? colour : 'rgba(255,255,255,0.06)',
    color: lit ? '#20222a' : '#f2ece2',
    borderColor: lit ? (danger ? '#ff8d84' : '#ffcf8a') : 'rgba(255,255,255,0.14)',
  }
}

function startButton(startable: boolean): React.CSSProperties {
  return {
    width: '100%',
    background: startable ? '#9fd8b0' : 'rgba(255,255,255,0.06)',
    color: startable ? '#183528' : '#f2ece2',
    opacity: startable ? 1 : 0.5,
    cursor: startable ? 'pointer' : 'default',
  }
}
