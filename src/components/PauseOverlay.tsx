import type { ReactNode } from 'react'

/**
 * The pause card every game shows over its stage. Shared rather than built
 * per-game so a timeout looks and reads the same everywhere - only the extra
 * buttons differ, and those come in as children.
 */
export function PauseOverlay({
  calledBy,
  onResume,
  hint,
  children,
}: {
  /** Somebody else's name when they called it; null when this player did. */
  calledBy: string | null
  onResume: () => void
  /** Overrides the default resume line. */
  hint?: string
  /** Extra buttons for this game - restart, leave, change character. */
  children?: ReactNode
}) {
  return (
    <div className="overlay">
      <h3>PAUSED</h3>
      <p>{calledBy ? `${calledBy} called a timeout - Esc to resume` : (hint ?? 'Esc to resume')}</p>
      <div className="overlay__row">
        <button type="button" className="btn btn--primary btn--sm" onClick={onResume}>
          Resume
        </button>
        {children}
      </div>
    </div>
  )
}
