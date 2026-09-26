/**
 * What escape opens once a round is actually going.
 *
 * Before a round starts, escape means what it always meant: take me back. Once
 * there is something running, taking you back without asking would throw away a
 * round you are in the middle of - so it stops instead, and asks.
 *
 * **It stops for everybody, and any player can stop it.** See `iMayControl`
 * for the rule that gives the card to the player who paused.
 *
 * **The buttons are the pauser's.** Everybody else gets the same card with the
 * same three words on it and nothing to press, and a line telling them who
 * they are waiting for - which is better than three dead buttons and no
 * explanation. If the host leaves, whoever hosts next gets the buttons.
 *
 * **What the last button does depends on who you are.** The host is the reason
 * anybody is in this game, so leaving takes everybody out and puts them back
 * where they were. A guest leaving takes only themselves - and, because they
 * were the one holding the pause, lets everybody else carry on.
 */
import { useParty } from '../../10-party'
import { useGameMode } from '../../13-modes'
import { FONT, ISLAND, button } from './look'
import { isVolcanoIslandParty } from './islandParty'
import { nameOfPauser, type Pauser } from './pause'
import { backOut, restartMinigame, resumeMinigame } from './state'
import { clicked } from './sound'

export function Paused({ isHost, pausedBy, me, mayControl }: { isHost: boolean; pausedBy: Pauser | null; me: string; mayControl: boolean }) {
  const party = useParty()
  const mode = useGameMode()
  const islandParty = isVolcanoIslandParty(party.phase, mode)
  const who = nameOfPauser(pausedBy, me)
  const mine = who === 'you'
  const gone = pausedBy !== null && !mine && mayControl

  return (
    <div style={backdrop}>
      <div style={card}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }} data-paused-by={pausedBy?.id ?? ''}>
          Paused
        </div>
        <div style={{ color: ISLAND.fadedInk, marginBottom: 14 }} data-pause-note>
          {mine
            ? isHost
              ? islandParty
                ? 'You paused the Volcano Island round for everybody. Resume when the party is ready.'
                : 'You paused the game for everybody. Leaving takes them all back with you.'
              : 'You paused the game for everybody. Leaving lets them carry on without you.'
            : gone
              ? `${who} paused the game and has since left, so it is yours to start again.`
              : `${who} paused the game. Only ${who} can resume it.`}
        </div>

        {mayControl ? (
          <>
            <button type="button" data-resume onClick={resumeMinigame} style={resume}>
              resume
            </button>
            {!islandParty ? (
              <>
                <button
                  type="button"
                  data-restart
                  onClick={clicked(restartMinigame)}
                  style={{ ...button, width: '100%', marginTop: 8, padding: '9px 16px', font: `700 14px/1.2 ${FONT}` }}
                >
                  restart the round
                </button>
                <button type="button" data-leave onClick={clicked(backOut)} style={{ ...button, width: '100%', marginTop: 8 }}>
                  {isHost ? 'back to the games' : 'leave this round'}
                </button>
              </>
            ) : null}
          </>
        ) : (
          <div style={waiting} data-waiting>
            waiting for {who || 'the player who paused'}
          </div>
        )}
      </div>
    </div>
  )
}

const backdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 48,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(12, 40, 55, 0.5)',
}

const card: React.CSSProperties = {
  width: 340,
  maxWidth: 'calc(100vw - 32px)',
  padding: '18px 20px',
  borderRadius: 20,
  background: ISLAND.sand,
  boxShadow: '0 6px 0 rgba(0,0,0,0.18)',
  color: ISLAND.ink,
  font: `14px/1.5 ${FONT}`,
}

const resume: React.CSSProperties = {
  width: '100%',
  padding: '10px 16px',
  borderRadius: 999,
  border: 'none',
  background: ISLAND.sun,
  boxShadow: '0 4px 0 #d79a22',
  color: ISLAND.ink,
  font: `700 16px/1.2 ${FONT}`,
  cursor: 'pointer',
}

/** Not a button: there is nothing here for anybody but the one who paused it. */
const waiting: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 16px',
  borderRadius: 999,
  background: ISLAND.warmSand,
  color: ISLAND.fadedInk,
  font: `600 14px/1.2 ${FONT}`,
  textAlign: 'center',
}
