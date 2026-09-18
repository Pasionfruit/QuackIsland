/**
 * The three moments between reading about a game and seeing who won.
 *
 * **The curtain.** One black sheet over everything, driven by `curtain(run)`.
 * It wipes in over the briefing, and by the time it is fully black the game
 * has been mounted underneath it - which is where a three.js canvas does its
 * expensive first frame, unwatched. Then it wipes off, and what is behind it is
 * the game, standing still, with a number over it.
 *
 * **The three-two-one happens over the game**, not on a screen of its own. You
 * see the course you are about to run before you run it, which is the whole
 * reason to do it this way round.
 *
 * **Finish.** A round that has ended says so, and gets two seconds: the word
 * over the top, the game going dark behind it, and then the results.
 *
 * Both sounds are one-shots fired on the edge of a phase, through `playOnce` -
 * see `sound.ts` for why they are not on the island's audio bus.
 */
import { useEffect } from 'react'
import { COUNT_FROM, countShown, curtain, type MinigameRun } from './registry'
import { FONT, ISLAND } from './look'
import { COUNTDOWN_SOUND, FINISH_SOUND, playOnce } from './sound'

/** The black sheet. Drawn for every phase that has one, and nothing otherwise. */
export function Curtain({ run }: { run: MinigameRun }) {
  const black = curtain(run)
  if (black <= 0) return null
  return <div style={{ ...sheet, opacity: black }} data-curtain={black.toFixed(2)} />
}

/**
 * Three, two, one - over the game.
 *
 * The number is keyed on itself so React rebuilds the element each second,
 * which is what restarts the pop animation. Without the key it would grow once
 * and then sit there changing digit.
 */
export function Countdown({ run }: { run: MinigameRun }) {
  const n = countShown(run)

  useEffect(() => {
    if (run.phase === 'counting' && run.countdown > COUNT_FROM - 0.001) playOnce(COUNTDOWN_SOUND)
  }, [run.phase, run.countdown > COUNT_FROM - 0.001])

  if (n === null) return null
  return (
    <div style={middle} data-countdown={n}>
      <div key={n} style={number}>
        {n}
      </div>
    </div>
  )
}

/** **Finish**, and the two seconds it takes the game to go dark behind it. */
export function Finish({ run }: { run: MinigameRun }) {
  useEffect(() => {
    if (run.phase === 'finishing') playOnce(FINISH_SOUND)
  }, [run.phase === 'finishing'])

  if (run.phase !== 'finishing') return null
  // Grows and settles over the first half-second, then holds while it dims.
  const through = 1 - run.countdown / 2
  const grown = Math.min(1, through * 4)
  return (
    <div style={middle} data-finish>
      <div
        style={{
          ...word,
          transform: `scale(${(0.6 + grown * 0.4).toFixed(3)})`,
          opacity: Math.min(1, grown * 2),
        }}
      >
        Finish!
      </div>
    </div>
  )
}

const sheet: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 46,
  background: '#000000',
  pointerEvents: 'none',
}

const middle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 47,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  pointerEvents: 'none',
}

const number: React.CSSProperties = {
  font: `900 150px/1 ${FONT}`,
  color: '#ffffff',
  textShadow: '0 8px 0 rgba(0,0,0,0.3)',
  animation: 'none',
}

const word: React.CSSProperties = {
  font: `900 96px/1 ${FONT}`,
  color: ISLAND.sun,
  textShadow: '0 8px 0 rgba(0,0,0,0.35)',
  letterSpacing: 2,
}
