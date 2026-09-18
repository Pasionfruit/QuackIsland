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
import { countShown, curtain, FADE, screenCounts, type MinigameRun } from './registry'
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
 * `started` is in the edge so a restart counts again even from a count.
 *
 * A pause holds the voice where it is, and only a **resume** carries it on.
 * Leaving the round, or restarting it, stops it dead: a held "two" must never
 * come back on its own the next time a screen mounts.
 */
export function Countdown({ run }: { run: MinigameRun }) {
  const n = countShown(run)
  const counts = screenCounts(run)
  const counting = run.phase === 'counting' && counts
  const start = useStartFlash(counting) && run.phase === 'playing'
  const wasPaused = useRef(run.paused)
  const wasStarted = useRef(run.started)

  // Order matters: hold or carry on first, then a restart stops everything, and
  // only then does a new count start its voice from the top.
  useEffect(() => {
    if (run.paused === wasPaused.current) return
    wasPaused.current = run.paused
    holdScreenSounds(run.paused)
  }, [run.paused])

  useEffect(() => {
    if (run.started === wasStarted.current) return
    wasStarted.current = run.started
    stopScreenSounds()
  }, [run.started])

  useEffect(() => {
    if (counting) playOnce(COUNTDOWN_SOUND)
  }, [counting, run.started])

  if (n !== null) return <Shown n={n} />
  if (start) return <Shown n="start" />
  return null
}

/**
 * The same three-two-one, for a game that counts for itself.
 *
 * `left` is the seconds until go, or `null` when the game is not counting. The
 * numbers, the pop, the voice and the **Start!** after are the screen's own, so
 * a count that happens later in a game - Pet Race's, after its pet choosing -
 * looks and sounds like every other. A pause holds the voice with the rest of
 * the screen's sounds.
 */
export function CountOver({ left }: { left: number | null }) {
  const counting = left !== null && left > 0
  const start = useStartFlash(counting)

  useEffect(() => {
    if (counting) playOnce(COUNTDOWN_SOUND)
  }, [counting])

  if (counting) return <Shown n={Math.ceil(left)} />
  if (start) return <Shown n="start" />
  return null
}

/**
 * **Start!** for a moment once a count runs out. The round is already running
 * under it - it is a word, not another wait.
 */
function useStartFlash(counting: boolean): boolean {
  const [start, setStart] = useState(false)
  const was = useRef(counting)
  useEffect(() => {
    const from = was.current
    was.current = counting
    if (counting || !from) {
      setStart(false)
      return
    }
    setStart(true)
    const timer = window.setTimeout(() => setStart(false), START_SHOWN_MS)
    return () => window.clearTimeout(timer)
  }, [counting])
  return start
}

/**
 * A number, or Start!, popping in over the middle of the screen.
 *
 * Keyed on itself so React rebuilds the element each second, which is what
 * restarts the pop. Without the key it would pop once and then sit there
 * changing digit.
 */
function Shown({ n }: { n: number | 'start' }) {
  return (
    <div style={middle}>
      <style>{POP}</style>
      <div key={n} style={n === 'start' ? startWord : number} data-countdown={n}>
        {n === 'start' ? 'Start!' : n}
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
