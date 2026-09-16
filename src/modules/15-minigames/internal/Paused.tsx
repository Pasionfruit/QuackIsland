/**
 * What escape opens once a round is actually going.
 *
 * Before a round starts, escape means what it always meant: take me back. Once
 * there is something running, taking you back without asking would throw away
 * a round you are in the middle of - so it stops instead, and asks.
 *
 * **What the second button does depends on who you are.** The host is the
 * reason anybody is in this game, so leaving takes everybody out and puts them
 * back where they were. A guest leaving takes only themselves, and they sit
 * the rest of it out until the host starts something else - there is no
 * dashboard behind it for them, because there is nothing there they could
 * choose.
 */
import { FONT, ISLAND, button } from './look'
import { backOut, resumeMinigame } from './state'

export function Paused({ isHost }: { isHost: boolean }) {
  return (
    <div style={backdrop}>
      <div style={card}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>Paused</div>
        <div style={{ color: ISLAND.fadedInk, marginBottom: 14 }}>
          {isHost
            ? 'The round is stopped. Leaving takes everybody back with you.'
            : 'The round carries on for everybody else. Escape again, or resume, to come back to it.'}
        </div>

        <button type="button" data-resume onClick={resumeMinigame} style={resume}>
          resume
        </button>
        <button
          type="button"
          data-leave
          onClick={backOut}
          style={{ ...button, width: '100%', marginTop: 8 }}
        >
          {isHost ? 'back to the games' : 'leave this round'}
        </button>
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
  width: 320,
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
