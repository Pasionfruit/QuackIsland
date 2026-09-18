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
import { useEffect, useRef, useState } from 'react'
import { countShown, curtain, FADE, type MinigameRun } from './registry'
import { FONT, ISLAND } from './look'
import { COUNTDOWN_SOUND, FINISH_SOUND, holdScreenSounds, playOnce, stopScreenSounds } from './sound'

/** How long "Start!" stays up once the round is running, in milliseconds. */
const START_SHOWN_MS = 800

/** The black sheet. Drawn for every phase that has one, and nothing otherwise. */
export function Curtain({ run }: { run: MinigameRun }) {
  const black = curtain(run)
  if (black <= 0) return null
  return <div style={{ ...sheet, opacity: black }} data-curtain={black.toFixed(2)} />
}

/**
 * Three, two, one, start - over the game.
 *
 * The sound is voiced, so it starts on the **edge** into `counting` rather than
 * on the clock reading exactly three: the fade hands its leftover time on, so
 * the count rarely begins at a clean three, and a check for one would miss it.
 * `started` is in the edge so a restart counts again even when the phase it
 * comes back to is the same one. A pause holds the voice where it is.
 *
 * The number is keyed on itself so React rebuilds the element each second,
 * which is what restarts the pop. Without the key it would pop once and then
 * sit there changing digit.
 */
export function Countdown({ run }: { run: MinigameRun }) {
  const n = countShown(run)
  const counting = run.phase === 'counting'
  const [start, setStart] = useState(false)
  const was = useRef(run.phase)

  useEffect(() => {
    if (counting) playOnce(COUNTDOWN_SOUND)
  }, [counting, run.started])

  useEffect(() => {
    holdScreenSounds(run.paused)
  }, [run.paused])

  // A restart goes back through the black. Whatever was being said when it was
  // pressed - a paused "two", carried on by the resume - stops there.
  useEffect(() => {
    if (run.phase === 'fading') stopScreenSounds()
  }, [run.phase, run.started])

  // "Start!" for a moment on the way from counting into the round. The game is
  // already running under it - it is a word, not another wait.
  useEffect(() => {
    const from = was.current
    was.current = run.phase
    if (from !== 'counting' || run.phase !== 'playing') {
      if (run.phase !== 'playing') setStart(false)
      return
    }
    setStart(true)
    const timer = window.setTimeout(() => setStart(false), START_SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [run.phase])

  if (n === null && !start) return null
  return (
    <div style={middle}>
      <style>{POP}</style>
      <div key={n ?? 'start'} style={n === null ? startWord : number} data-countdown={n ?? 'start'}>
        {n ?? 'Start!'}
      </div>
    </div>
  )
}

/** **Finish**, and the two seconds it takes the game to go dark behind it. */
export function Finish({ run }: { run: MinigameRun }) {
  const finishing = run.phase === 'finishing'

  useEffect(() => {
    if (finishing) playOnce(FINISH_SOUND)
  }, [finishing])

  if (!finishing) return null
  // Slams in over the first quarter-second, then holds while the game dims.
  const through = 1 - run.countdown / FADE.dim
  const grown = Math.min(1, through * 8)
  return (
    <div style={middle} data-finish>
      <div
        style={{
          ...word,
          transform: `scale(${(1.6 - grown * 0.6).toFixed(3)})`,
          opacity: Math.min(1, grown * 2),
        }}
      >
        Finish
      </div>
    </div>
  )
}

/** The pop each number makes as it lands. One rule, shared by all of them. */
const POP = `@keyframes localrot-count-pop {
  0% { transform: scale(1.7); opacity: 0; }
  35% { transform: scale(0.94); opacity: 1; }
  60% { transform: scale(1.04); }
  100% { transform: scale(1); opacity: 1; }
}`

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
  font: `900 180px/1 ${FONT}`,
  color: '#ffffff',
  textShadow: '0 8px 0 rgba(0,0,0,0.3)',
  animation: 'localrot-count-pop 0.45s ease-out both',
}

const startWord: React.CSSProperties = {
  ...number,
  font: `900 140px/1 ${FONT}`,
  color: ISLAND.sun,
}

/** Big: the one word on the screen, and it has the whole of it. */
const word: React.CSSProperties = {
  font: `900 190px/1 ${FONT}`,
  color: ISLAND.sun,
  textShadow: '0 10px 0 rgba(0,0,0,0.35)',
  letterSpacing: 4,
}
