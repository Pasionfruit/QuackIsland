/**
 * The lawn: eight rows, twelve columns, and nothing else.
 *
 * Pure indices. This is a **2D game** - it is played on a board drawn over the
 * world, not in it - so there are no metres in here and no world coordinates.
 * A square is a row and a column, the view decides how big that is on screen,
 * and every rule written later works in squares.
 *
 * **Rows are lanes.** Column 0 is the house end and the last column is where
 * pests come in, so a pest walks from the far end towards 0 along one row. That is the only
 * thing here which is a game decision rather than arithmetic, and it is
 * written down so the whole build agrees on it before anybody writes a wave.
 */

export const GRID = {
  /**
   * Lanes.
   *
   * Eight of them because two people play on one lawn: six was a board one
   * player could cover, and two players covering one board between them is
   * two players watching each other play.
   */
  rows: 8,
  /** Squares along a lane. Long enough that a lane is a journey. */
  cols: 12,
} as const

/** One square. */
export interface Cell {
  row: number
  col: number
}

/** How many squares there are. */
export function cellCount(): number {
  return GRID.rows * GRID.cols
}

/** Whether a row and column name a square on the lawn. */
export function inGrid(row: number, col: number): boolean {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < GRID.rows &&
    col >= 0 &&
    col < GRID.cols
  )
}

/**
 * A square's place in reading order, or `-1` if it is not one.
 *
 * What a flat array of squares is indexed by, so the board can be one array
 * rather than an array of arrays.
 */
export function cellIndex(row: number, col: number): number {
  return inGrid(row, col) ? row * GRID.cols + col : -1
}

/** The square at a place in reading order, or `null`. */
export function cellAt(index: number): Cell | null {
  if (!Number.isInteger(index) || index < 0 || index >= cellCount()) return null
  return { row: Math.floor(index / GRID.cols), col: index % GRID.cols }
}

/** Every square, in reading order. What the board is drawn from. */
export function everyCell(): Cell[] {
  const cells: Cell[] = []
  for (let row = 0; row < GRID.rows; row++) {
    for (let col = 0; col < GRID.cols; col++) cells.push({ row, col })
  }
  return cells
}

/**
 * Which way round a square is shaded.
 *
 * On the sum of the indices, which is what makes the checks alternate along a
 * lane *and* across the lanes. In here rather than in the view because a test
 * can see it and a stylesheet cannot.
 */
export function isLight(row: number, col: number): boolean {
  return (row + col) % 2 === 0
}

/**
 * How far along its lane something is, 0 at the house and 1 where pests come in.
 *
 * Fractional, because a pest spends most of its life between two squares.
 */
export function laneProgress(col: number): number {
  const last = GRID.cols - 1
  if (last <= 0) return 0
  return Math.min(1, Math.max(0, col / last))
}

/** Where pests come in. */
export function entryCol(): number {
  return GRID.cols - 1
}

/** The end they are walking towards. Past this, the lawn is lost. */
export function houseCol(): number {
  return 0
}
