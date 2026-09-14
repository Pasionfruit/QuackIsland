/**
 * The lobby: who you are, whether you are ready, who with, what you are
 * playing, and the host's way to start it.
 *
 * Top left, behind one button, because it is the first thing you do and the
 * last thing you want to hunt for.
 *
 * **The order on screen is the order you do things in**, which is not the
 * order the code would naturally fall into: your name, then readying up if you
 * are in a party, then the code that gets you into one, then the game, then
 * start. Readying sits second because it is what you come back to the popup
 * for; the code sits under it because you type it once and never again.
 *
 * **Making and joining are two different things and have two different spots.**
 * One field that was both was the joining bug: it opened holding a code of
 * your own, so the person typing a friend's code had to clear yours out first,
 * and the same button said join whether you were starting a lobby or arriving
 * at one. Now your code sits in one place with **create** under it, theirs in
 * another with **join**, and the join field keeps working while you are
 * already in a lobby - typing a second code moves you.
 *
 * Lives in the app rather than in a module because it reads across four -
 * who is connected (`09-net`), what the party is doing (`10-party`), what it
 * has chosen to play (`13-modes`) and how (`14-garden`) - and the composition
 * root is the one place allowed to know all of them.
 */
import { useEffect, useRef, useState } from 'react'
import { joinLobby, leaveLobby, makeCode, normaliseCode, useNet, usePeers } from '../modules/09-net'
import {
  ME,
  canStart,
  hostGame,
  setReady,
  startGame,
  useParty,
  waitingFor,
} from '../modules/10-party'
import { MODES, chooseMode, modeById, useGameMode, useModeSync } from '../modules/13-modes'
import {
  GARDEN_MODES,
  chooseGardenMode,
  needsPlayers,
  useGardenMode,
  useGoofsSync,
} from '../modules/14-garden'

export function LobbyPopup() {
  const [open, setOpen] = useState(false)
  const net = useNet()
  const peers = usePeers()
  const party = useParty()
  const mode = useGameMode()
  const gardenMode = useGardenMode()

  // One subscription each for the page. This component is always mounted - the
  // button is - so the lobby's choices stay in step whether the popup is open
  // or not, which they have to: a game can start while you are not looking.
  useModeSync()
  useGoofsSync()

  // Typed into and nothing else, so ordinary React state. `joinLobby` is what
  // turns them into a lobby; nothing in the world reads them.
  const [mine, setMine] = useState(() => makeCode())
  const [theirs, setTheirs] = useState('')
  const [name, setName] = useState('player')

  const joined = net.status === 'joined'
  // The host picks the game, the same as the clock and the weather. Alone you
  // are your own host, so picking works before anybody else has arrived.
  const guest = joined && !net.host
  // Mid-game the choice is settled; changing it under people already on the
  // island is a way to break a game rather than a way to leave one.
  const locked = party.phase !== 'off'

  const game = modeById(mode)
  const everyone = [...peers.map((p) => p.id), ME]
  const ready = party.ready.has(ME)
  const waiting = waitingFor(everyone, party.ready)
  const needed = mode === 'garden' ? needsPlayers(gardenMode) : 1
  const enough = everyone.length >= needed
  const startable = canStart(party.phase, net.host, everyone, party.ready) && game.built && enough

  /**
   * Being in a lobby *is* gathering.
   *
   * There is no separate "open a game" step any more: you join, you ready up,
   * the host starts. The host is the one who says so, because the phase is
   * theirs, and `10-party` puts everybody back to `off` the moment nobody is
   * in a lobby - so this only ever runs while there is a lobby to be in.
   */
  useEffect(() => {
    if (joined && net.host && party.phase === 'off') hostGame()
  }, [joined, net.host, party.phase])

  /**
   * Say hello on arrival.
   *
   * Announcing that you are not ready is what tells the host you are here, and
   * the host answers with the phase - which is the only way somebody who joins
   * mid-gathering finds out that everybody else is getting ready. It also puts
   * you in a new lobby un-readied rather than carrying the last one's answer.
   */
  useEffect(() => {
    if (joined) setReady(false)
  }, [joined, net.room])

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

  const canJoinTheirs = normaliseCode(theirs) !== null

  const startNote = !joined
    ? 'create a lobby, or join one, to play with anybody'
    : party.phase === 'playing'
      ? 'the game is running'
      : !game.built
        ? 'that game has nowhere to go yet'
        : !enough
          ? `${needed} players needed for ${gardenMode}`
          : waiting > 0
            ? `waiting on ${waiting} to ready up`
            : net.host
              ? 'everybody is ready'
              : 'everybody is ready - the host starts it'

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
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ ...button, padding: '0 6px' }}
            >
              esc
            </button>
          </div>

          {/* 1. Who you are. */}
          <div style={row}>
            <span style={{ opacity: 0.5, width: 52 }}>you are</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 16))}
              placeholder="name"
              spellCheck={false}
              style={{ ...field, flex: 1, minWidth: 40 }}
            />
          </div>

          {/* 2. Ready. Only in a party: on your own there is nobody to be
                 ready for, and a button that means nothing is worse than no
                 button at all. */}
          {joined ? (
            <>
              <div style={rule} />
              <button
                type="button"
                onClick={() => setReady(!ready)}
                style={{
                  ...button,
                  width: '100%',
                  padding: '6px 8px',
                  background: ready ? '#6fb6c8' : 'rgba(255,255,255,0.06)',
                  color: ready ? '#16202a' : '#f2ece2',
                }}
              >
                {ready ? 'ready' : 'ready up'}
              </button>
              <div style={{ opacity: 0.45, marginTop: 4 }}>
                {waiting === 0
                  ? 'everybody is ready'
                  : `${waiting} of ${everyone.length} still to ready up`}
              </div>
            </>
          ) : null}

          <div style={rule} />

          {/* 3. The code. Your own to share, or somebody else's to type. The
                 relay only ever knows about rooms; what a game is stays
                 entirely in the browser. */}
          <div style={caption}>start your own</div>
          <div style={row}>
            <input
              value={mine}
              onChange={(e) => setMine(e.target.value.toUpperCase().slice(0, 5))}
              spellCheck={false}
              style={{ ...field, width: 78, letterSpacing: 2, textAlign: 'center', color: '#ffcf8a' }}
            />
            <button
              type="button"
              onClick={() => setMine(makeCode())}
              style={{ ...button, padding: '3px 7px' }}
              title="Make a different code"
            >
              new
            </button>
            <button
              type="button"
              onClick={() => joinLobby(mine, name)}
              disabled={joined && net.room === mine}
              style={{
                ...button,
                flex: 1,
                background: joined ? 'rgba(255,255,255,0.06)' : '#e0a05a',
                color: joined ? '#f2ece2' : '#20222a',
              }}
            >
              create
            </button>
          </div>

          {/* Somebody else's lobby. Its own field, which is the whole point:
              you are not editing your code, you are typing theirs. */}
          <div style={{ ...caption, marginTop: 8 }}>or join someone</div>
          <div style={row}>
            <input
              value={theirs}
              onChange={(e) => setTheirs(e.target.value.toUpperCase().slice(0, 5))}
              placeholder="THEIRS"
              spellCheck={false}
              style={{ ...field, width: 78, letterSpacing: 2, textAlign: 'center', color: '#9fd8e6' }}
            />
            <button
              type="button"
              onClick={() => joinLobby(theirs, name)}
              disabled={!canJoinTheirs}
              style={{
                ...button,
                flex: 1,
                opacity: canJoinTheirs ? 1 : 0.45,
                cursor: canJoinTheirs ? 'pointer' : 'default',
              }}
            >
              join
            </button>
          </div>

          <div style={{ ...row, marginTop: 8, alignItems: 'center' }}>
            <span style={{ flex: 1, opacity: 0.55 }}>
              {joined
                ? `in ${net.room} - ${net.peers} other${net.peers === 1 ? '' : 's'}${
                    net.host ? ', you host' : ''
                  }`
                : net.status === 'connecting'
                  ? 'connecting...'
                  : net.status === 'error'
                    ? net.why
                    : 'nobody can reach you until you create or join'}
            </span>
            {joined ? (
              <button type="button" onClick={() => leaveLobby()} style={{ ...button, opacity: 0.8 }}>
                leave
              </button>
            ) : null}
          </div>

          <div style={rule} />

          {/* 4. The game. The host's to choose; everybody else is told. */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ opacity: 0.55, letterSpacing: 0.6 }}>GAME</span>
            <span style={{ opacity: 0.4 }}>
              {guest ? 'the host picks' : locked ? 'settled for this round' : 'pick one'}
            </span>
          </div>

          {MODES.map((entry) => {
            const picked = entry.id === mode
            const pickable = !guest && !locked
            return (
              <div key={entry.id}>
                <button
                  type="button"
                  onClick={() => chooseMode(entry.id)}
                  disabled={!pickable}
                  style={{ ...choice(picked, pickable) }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ color: picked ? '#9fd8e6' : '#f2ece2' }}>{entry.title}</span>
                    <span style={{ opacity: 0.55 }}>{picked ? 'chosen' : ''}</span>
                  </span>
                  <span style={{ display: 'block', opacity: 0.5, marginTop: 2 }}>{entry.blurb}</span>
                </button>

                {/* Garden Goofs has three ways to play, and they only mean
                    anything while it is the one chosen. */}
                {picked && entry.id === 'garden' ? (
                  <div style={{ paddingLeft: 10, marginBottom: 5 }}>
                    {GARDEN_MODES.map((way) => {
                      const on = way.id === gardenMode
                      return (
                        <button
                          key={way.id}
                          type="button"
                          onClick={() => chooseGardenMode(way.id)}
                          disabled={!pickable}
                          style={{ ...choice(on, pickable), padding: '4px 8px' }}
                        >
                          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ color: on ? '#9fd8e6' : '#f2ece2' }}>{way.title}</span>
                            <span style={{ opacity: 0.5 }}>
                              {needsPlayers(way.id) > 1 ? `${needsPlayers(way.id)}+` : '1+'}
                            </span>
                          </span>
                          <span style={{ display: 'block', opacity: 0.45, marginTop: 2 }}>
                            {way.blurb}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}

          <div style={rule} />

          {/* 5. Start. The host's alone: starting moves everybody, and that is
                 not something to hand to whoever happens to be in the room. */}
          {net.host ? (
            <button
              type="button"
              onClick={startGame}
              disabled={!startable}
              style={{
                ...button,
                width: '100%',
                padding: '6px 8px',
                background: startable ? '#e0a05a' : 'rgba(255,255,255,0.06)',
                color: startable ? '#20222a' : '#f2ece2',
                opacity: startable ? 1 : 0.5,
                cursor: startable ? 'pointer' : 'default',
              }}
            >
              {party.phase === 'playing' ? 'playing' : 'start the party'}
            </button>
          ) : (
            <div style={{ opacity: 0.5, textAlign: 'center' }}>
              {party.phase === 'playing' ? 'the game is running' : 'the host starts the party'}
            </div>
          )}

          <div style={{ opacity: 0.45, marginTop: 5 }}>{startNote}</div>
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
  width: 286,
  maxHeight: 'calc(100vh - 80px)',
  overflowY: 'auto',
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

/** A row in one of the pick-one lists. */
function choice(picked: boolean, pickable: boolean): React.CSSProperties {
  return {
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
  }
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

const row: React.CSSProperties = { display: 'flex', gap: 5, alignItems: 'center' }

const caption: React.CSSProperties = { opacity: 0.5, marginBottom: 3 }

const rule: React.CSSProperties = {
  height: 1,
  background: 'rgba(255,255,255,0.1)',
  margin: '9px 0',
}
