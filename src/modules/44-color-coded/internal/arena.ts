/**
 * The arena and the clock it runs on: a floating grid of colour panels, and a
 * round that goes spin, reveal, drop, rebuild, again and again.
 *
 * **The whole schedule is arithmetic on the clock**, and the colours are dealt
 * from the seed and the round number - so every screen works out for itself
 * which panels are which colour, which colour the wheel lands on and which
 * panels are gone, and none of it is ever sent.
 *
 * Everything here is pure.
 */
import { createRng, hashSeed } from '../../00-core'

export const GRID = {
  /** Panels along each side. */
  size: 6,
  /** How wide a panel is, metres. Panels touch: there is no gap to fall through. */
  cell: 3,
  /** How thick a panel is drawn. */
  thick: 0.5,
} as const

/** Half the arena's width: past this, there is nothing under you. */
export const HALF = (GRID.size * GRID.cell) / 2

/** The six panel colours, in wheel order. */
export const PANEL_COLOURS = ['#ff4d5a', '#3d8bff', '#ffd23d', '#3ddc6a', '#b05cff', '#ff9a3d'] as const
export const PANEL_NAMES = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'] as const

/** Seconds of each phase of a round. */
export const PHASES = {
  /** The wheel spins; everybody can move and push. */
  spin: 3,
  /** The colour is up: two seconds to get on it. */
  reveal: 2,
  /** Every other panel drops away. */
  drop: 1.5,
  /** And slowly comes back. */
  rebuild: 2.5,
} as const

export type Phase = keyof typeof PHASES
const ORDER: readonly Phase[] = ['spin', 'reveal', 'drop', 'rebuild']
export const ROUND_LENGTH = PHASES.spin + PHASES.reveal + PHASES.drop + PHASES.rebuild

/**
 * How many panels of the wheel's colour there are, round by round: fewer every
 * round, down to a single one.
 */
export const VIABLE = [8, 6, 5, 4, 3, 3, 2, 2, 1] as const

/** How many panels of the colour round `round` (from 1) deals. */
export function viable(round: number): number {
  return VIABLE[Math.min(Math.max(1, round), VIABLE.length) - 1]
}

export interface When {
  /** From 1. */
  round: number
  phase: Phase
  /** Seconds into the phase. */
  t: number
  /** Seconds the phase lasts. */
  length: number
}

/** Where the clock has got to: which round, which phase, how far in. */
export function when(elapsed: number): When {
  const e = Math.max(0, elapsed)
  const round = Math.floor(e / ROUND_LENGTH) + 1
  let t = e - (round - 1) * ROUND_LENGTH
  for (const phase of ORDER) {
    if (t < PHASES[phase] || phase === 'rebuild') return { round, phase, t, length: PHASES[phase] }
    t -= PHASES[phase]
  }
  return { round, phase: 'rebuild', t, length: PHASES.rebuild }
}

export interface Deal {
  round: number
  /** Which colour the wheel lands on. */
  colour: number
  /** Every panel's colour, row by row from the north-west. */
  panels: number[]
}

const deals = new Map<string, Deal>()

/**
 * A round's colours: the wheel's colour on exactly `viable(round)` panels, and
 * every other panel one of the other five. The same seed and round, the same
 * deal.
 */
export function dealFor(seed: number, round: number): Deal {
  const key = `${seed}:${round}`
  const known = deals.get(key)
  if (known) return known
  const random = createRng(hashSeed(seed, `color-coded:deal:${round}`))
  const count = GRID.size * GRID.size
  const colour = Math.floor(random() * PANEL_COLOURS.length)
  const cells = Array.from({ length: count }, (_, i) => i)
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[cells[i], cells[j]] = [cells[j], cells[i]]
  }
  const safe = new Set(cells.slice(0, viable(round)))
  const panels = Array.from({ length: count }, (_, i) => {
    if (safe.has(i)) return colour
    const other = Math.floor(random() * (PANEL_COLOURS.length - 1))
    return other >= colour ? other + 1 : other
  })
  const deal = { round, colour, panels }
  deals.set(key, deal)
  if (deals.size > 64) deals.delete(deals.keys().next().value!)
  return deal
}

/** The middle of panel `index`. */
export function panelCentre(index: number): { x: number; z: number } {
  const col = index % GRID.size
  const row = Math.floor(index / GRID.size)
  return { x: -HALF + (col + 0.5) * GRID.cell, z: -HALF + (row + 0.5) * GRID.cell }
}

/** Which panel a point is over, or -1 if it is off the arena. */
export function panelAt(x: number, z: number): number {
  if (Math.abs(x) >= HALF || Math.abs(z) >= HALF) return -1
  const col = Math.min(GRID.size - 1, Math.floor((x + HALF) / GRID.cell))
  const row = Math.min(GRID.size - 1, Math.floor((z + HALF) / GRID.cell))
  return row * GRID.size + col
}

/** Whether panel `index` is there to stand on at `elapsed`: always, but in the drop and the rebuild if it is the wrong colour. */
export function solid(seed: number, elapsed: number, index: number): boolean {
  if (index < 0) return false
  const w = when(elapsed)
  if (w.phase === 'spin' || w.phase === 'reveal') return true
  const deal = dealFor(seed, w.round)
  return deal.panels[index] === deal.colour
}

/**
 * How far up a panel is, for drawing: 0 in place, down to -1 fallen away. A
 * wrong panel drops in the drop and rises back through the rebuild.
 *
 * **It rises in a straight line and arrives exactly as the rebuild ends** - which
 * is the moment `solid` says it can be stood on again. It used to ease out, and
 * an ease-out looks finished long before it is: a panel at a hundredth of its way
 * down looks like a panel, and it was still a second from being one. So what you
 * see and what holds you are the same thing: a panel is standable exactly when it
 * has stopped rising, and never before.
 */
export function panelLift(seed: number, elapsed: number, index: number): number {
  const w = when(elapsed)
  if (w.phase === 'spin' || w.phase === 'reveal') return 0
  const deal = dealFor(seed, w.round)
  if (deal.panels[index] === deal.colour) return 0
  if (w.phase === 'drop') return -Math.min(1, (w.t / 0.5) ** 2)
  // Back up at a steady pace, flush at the very end of the rebuild and not before.
  return -(1 - Math.min(1, w.t / w.length))
}

/** The colour a panel is drawn at `elapsed`: this round's deal, or - until the next spin starts - the one before. */
export function panelColour(seed: number, elapsed: number, index: number): number {
  return dealFor(seed, when(elapsed).round).panels[index]
}

/**
 * Where the wheel has turned to at `elapsed`, radians: it spins through the
 * spin, a few turns, slowing, and stops with the round's colour at the top;
 * then it holds there until the next spin.
 */
export function wheelAngle(seed: number, elapsed: number): number {
  const w = when(elapsed)
  const rest = (round: number) => {
    if (round < 1) return 0
    const c = dealFor(seed, round).colour
    // Segment c's middle, turned to the top (a quarter turn round from +x), plus four whole turns a round.
    return Math.PI / 2 - ((c + 0.5) * Math.PI * 2) / PANEL_COLOURS.length + Math.PI * 2 * 4 * round
  }
  const from = rest(w.round - 1)
  const to = rest(w.round)
  if (w.phase !== 'spin') return to
  const k = w.t / w.length
  return from + (to - from) * (1 - (1 - k) ** 3)
}

/** Where player `index` of `count` starts: round a ring on the panels, facing the middle. */
export function spawnPoint(index: number, count: number): { x: number; z: number; yaw: number } {
  const angle = (index / Math.max(1, count)) * Math.PI * 2 + Math.PI / 4
  const r = count <= 1 ? 0 : HALF * 0.62
  const x = Math.sin(angle) * r
  const z = Math.cos(angle) * r
  return { x, z, yaw: Math.atan2(x, z) }
}
