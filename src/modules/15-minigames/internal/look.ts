/**
 * How the minigame screens are dressed, in one place.
 *
 * The dashboard and every game's panel are the same kind of thing - a page
 * that takes the whole window - so the chrome is shared rather than copied
 * into each. What a game draws *inside* its page is its own business; this is
 * only the frame around it.
 *
 * Two rules the whole screen is built on, both learned the hard way next door
 * in Garden Goofs:
 *
 * - **It is a page, not a panel.** Opaque, every edge of the window, nothing
 *   of the world showing through behind it.
 * - **Nothing scrolls.** Every column is a flexbox whose give is on the part
 *   that can take it, and the grid inside shares out what is left rather than
 *   growing past the bottom of the window.
 */

export const screen: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  background: 'radial-gradient(ellipse at 50% 25%, #221d2e 0%, #0d0e14 70%)',
  color: '#f2ece2',
  font: '12px/1.6 ui-monospace, SFMono-Regular, Menlo, monospace',
  userSelect: 'none',
}

/** The top strip: a row of the page rather than something floating over it. */
export const bar: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  background: 'rgba(20, 22, 26, 0.55)',
  borderBottom: '1px solid rgba(255,255,255,0.1)',
}

/** Everything under the bar. All the room there is, and never more. */
export const body: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: '12px 16px',
  boxSizing: 'border-box',
  overflow: 'hidden',
}

export const button: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 4,
  color: '#f2ece2',
  font: 'inherit',
  padding: '3px 8px',
  cursor: 'pointer',
}

export const buttonOn: React.CSSProperties = {
  borderColor: '#b39ddb',
  background: 'rgba(179,157,219,0.18)',
}

/** The two kinds, each with a colour it keeps everywhere on the screen. */
export const KIND_COLOUR = {
  'free-for-all': '#7fd1b9',
  'one-vs-all': '#e0a05a',
} as const

/**
 * The three build stages, each with a colour and a short label.
 *
 * A dashboard of forty-one tiles is mostly a progress report, so how far along
 * a game is has to be readable without stopping to read - hence three pips in
 * a row rather than a sentence you have to find and parse.
 */
export const STEP_LOOK = {
  environment: { label: 'environment', short: 'env', colour: '#9fd8e6' },
  controls: { label: 'controls', short: 'ctl', colour: '#e8d98a' },
  assets: { label: 'assets', short: 'art', colour: '#7fd1b9' },
} as const

/** A slot nobody has named yet, drawn faint so the gaps read as gaps. */
export const RESERVED_LOOK = { label: 'free slot', colour: '#6b7280', fade: 0.45 } as const
