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
 */
import type { ReactNode } from 'react'

export function TopTimer({ children }: { children: ReactNode }) {
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
