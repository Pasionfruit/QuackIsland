/**
 * How the minigame screens are dressed, in one place.
 *
 * The dashboard and every game's screen are the same kind of thing - a page
 * that takes the whole window - so the chrome is shared rather than copied
 * into each. What a game draws *inside* its page is its own business; this is
 * only the frame around it.
 *
 * **It is meant to look like the island, not like the debug panel.** The rest
 * of the interface is dark slate and monospace because it is instrumentation:
 * a frame counter wants to be legible and ignorable. A wall of party games is
 * the opposite thing, so this is sand, sea and sun, in a rounded face, with
 * nothing square on it.
 *
 * No web font is loaded. `ui-rounded` is the real thing on Apple platforms and
 * the stack falls back through Segoe UI on Windows, which is friendly without
 * being round - a genuinely rounded face everywhere would mean shipping one,
 * and that is a bigger decision than a colour scheme.
 *
 * Two rules the whole screen is built on, both learned next door in Garden
 * Goofs:
 *
 * - **It is a page, not a panel.** Opaque, every edge of the window, nothing
 *   of the world showing through behind it.
 * - **Nothing scrolls.** Every column is a flexbox whose give is on the part
 *   that can take it, and the grid inside shares out what is left rather than
 *   growing past the bottom of the window.
 */

/** Sand, sea, sun and palm. The island, as a handful of numbers. */
export const ISLAND = {
  /** The sky behind everything, light at the top like a morning. */
  sky: '#8ed3e8',
  sea: '#3f9fc4',
  deepSea: '#1f6d92',
  sand: '#f6e4bf',
  warmSand: '#ecd0a0',
  palm: '#5eb85b',
  sun: '#ffc94d',
  coral: '#e8705a',
  /** Writing. A warm brown rather than black, which reads as ink on sand. */
  ink: '#4a3524',
  /** Writing that is not the point: labels, counts, the small print. */
  fadedInk: '#8a725c',
} as const

/**
 * The face. Rounded where the platform has one, friendly where it does not.
 *
 * Deliberately not the `ui-monospace` the HUDs use. Monospace is for numbers
 * you compare down a column; this is for names you read across.
 */
export const FONT =
  "ui-rounded, 'Hiragino Maru Gothic ProN', 'Segoe UI', system-ui, -apple-system, sans-serif"

export const screen: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 42,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  // Sky at the top down into the sea, which is the island seen from off shore.
  background: `linear-gradient(180deg, ${ISLAND.sky} 0%, #6fc2dd 38%, ${ISLAND.sea} 100%)`,
  color: ISLAND.ink,
  font: `14px/1.5 ${FONT}`,
  userSelect: 'none',
}

/** The top strip: a row of the page rather than something floating over it. */
export const bar: React.CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 16px',
  background: ISLAND.sand,
  borderBottom: `2px solid ${ISLAND.warmSand}`,
  color: ISLAND.ink,
}

/** Everything under the bar. All the room there is, and never more. */
export const body: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  padding: '14px 16px',
  boxSizing: 'border-box',
  overflow: 'hidden',
}

/** The screen's own name, in the bar. */
export const wordmark: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  letterSpacing: 0.3,
  color: ISLAND.deepSea,
}

/** Nothing on this screen has a square corner. */
export const button: React.CSSProperties = {
  background: ISLAND.sand,
  border: `2px solid ${ISLAND.warmSand}`,
  borderRadius: 999,
  color: ISLAND.ink,
  font: `600 13px/1.4 ${FONT}`,
  padding: '5px 14px',
  cursor: 'pointer',
}

export const buttonOn: React.CSSProperties = {
  background: ISLAND.sun,
  borderColor: '#e8a92f',
  color: ISLAND.ink,
}

/** The two kinds, each with a colour it keeps everywhere on the screen. */
export const KIND_COLOUR = {
  'free-for-all': '#2f9e6f',
  'one-vs-all': '#e0803a',
} as const

/**
 * The three build stages, each with a colour and a short label.
 *
 * A dashboard of forty-one tiles is mostly a progress report, so how far along
 * a game is has to be readable without stopping to read - hence three pips in
 * a row rather than a sentence you have to find and parse.
 */
export const STEP_LOOK = {
  environment: { label: 'environment', short: 'env', colour: '#2f9e6f' },
  controls: { label: 'controls', short: 'ctl', colour: '#e8a92f' },
  assets: { label: 'assets', short: 'art', colour: '#d1604a' },
} as const

/** A slot nobody has named yet, drawn faint so the gaps read as gaps. */
export const RESERVED_LOOK = { label: 'free slot', colour: '#a08d78', fade: 0.55 } as const
