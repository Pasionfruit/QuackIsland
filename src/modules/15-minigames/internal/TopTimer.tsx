/**
 * Where every minigame's clock goes: the middle of the top of the screen.
 *
 * Each game still draws its own clock - its own colours, its own idea of
 * when it goes red - and hands it to this to be placed. One place for it is
 * the point: whichever game you are in, the time is where you look for it.
 *
 * Fixed rather than laid out in the game's own bar, so it sits dead centre
 * whatever else is in that bar, and above the game's page (42) but under the
 * results, countdown and pause cards (46 and up).
 *
 * **The last six seconds tick.** A game whose round ends on a deadline hands
 * over `left`, the seconds until it does, and the six-second countdown sound
 * starts on the edge into the last six - so it ends on zero. A clock that
 * counts up, or only times a turn, leaves it out and stays quiet. The sound is
 * one of the screen's own, so a pause holds it and Finish stops it.
 */
import { useEffect, useRef, type ReactNode } from 'react'
import { LAST_SECONDS_SOUND, playOnce, stopOne } from './sound'

/** When the tick starts: the length of the sound, so it runs out on zero. */
export const LAST_SECONDS = 6

export function TopTimer({ children, left }: { children: ReactNode; left?: number | null }) {
  const inLast = left != null && left > 0 && left <= LAST_SECONDS
  const was = useRef(inLast)

  useEffect(() => {
    const from = was.current
    was.current = inLast
    if (inLast && !from) playOnce(LAST_SECONDS_SOUND)
  }, [inLast])

  useEffect(() => () => stopOne(LAST_SECONDS_SOUND), [])

  return (
    <div style={wrap} data-top-timer>
      {children}
    </div>
  )
}

const wrap: React.CSSProperties = {
  position: 'fixed',
  top: 8,
  left: '50%',
  transform: 'translateX(-50%) scale(1.35)',
  transformOrigin: 'top center',
  zIndex: 44,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  pointerEvents: 'none',
  filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.25))',
}
