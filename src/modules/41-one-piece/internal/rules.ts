/**
 * The rules of One Piece?!, as arithmetic.
 *
 * Everybody gets a square picture of their own face, cut into six pieces - two
 * across, three down - and scattered round the table, every one of them turned
 * the wrong way. Drag each piece into the frame, turn it the right way up, and
 * it clicks in. The first to click in all six is first, the next is second,
 * and so on.
 *
 * Two halves here. **The table** (`Board`) is yours alone: where each of your
 * pieces is, how it is turned, and which have clicked in. Nobody else needs to
 * know where your loose pieces are lying, so it never goes on the wire. **The
 * race** (`Game`) is what everybody shares: for each player, which of their six
 * pieces are in, and when they finished.
 *
 * The game ends when three have finished, everybody still here has, or the
 * time is up. Places go by who finished, soonest first, then by how many
 * pieces everybody else got in.
 *
 * Everything here is pure. Where the pieces start comes from the seed, which
 * everybody has, so everybody's pieces start in the same places turned the
 * same ways - nobody is dealt an easier table.
 */
import { createRng, hashSeed } from '../../00-core'

export const PUZZLE = {
  /** The picture is cut two across and three down. */
  cols: 2,
  rows: 3,
  pieces: 6,
  /** Seconds the whole game may run. */
  limit: 90,
  /** The game is over as soon as this many have finished. */
  podium: 3,
} as const

/**
 * The table, in its own units: the screen scales it to fit. The frame the
 * picture goes in is in the middle, and the pieces start either side of it.
 */
export const TABLE = {
  width: 1000,
  height: 600,
  /** The frame's side. */
  frame: 360,
  /** The frame's top left corner. */
  frameX: 320,
  frameY: 120,
  /** How near its place a piece's middle has to be dropped, the right way up, to click in. */
  snap: 32,
} as const

/** One piece's size, the right way up. */
export const PIECE = { w: TABLE.frame / PUZZLE.cols, h: TABLE.frame / PUZZLE.rows } as const

/** Every piece in, as a mask: one bit a piece. */
export const FULL = (1 << PUZZLE.pieces) - 1

/** Which column and row of the picture piece `index` is. Left to right, then top to bottom. */
export function cellOf(index: number): { col: number; row: number } {
  return { col: index % PUZZLE.cols, row: Math.floor(index / PUZZLE.cols) }
}

/** Where piece `index`'s middle goes when it is in. */
export function slotOf(index: number): { x: number; y: number } {
  const { col, row } = cellOf(index)
  return { x: TABLE.frameX + (col + 0.5) * PIECE.w, y: TABLE.frameY + (row + 0.5) * PIECE.h }
}

/** Half a piece's width and height as it lies, turned `turns` quarter turns. */
export function halfExtent(turns: number): { x: number; y: number } {
  return turns % 2 === 0 ? { x: PIECE.w / 2, y: PIECE.h / 2 } : { x: PIECE.h / 2, y: PIECE.w / 2 }
}

/** Where a piece starts: its middle, and how many quarter turns clockwise it is off. */
export interface Start {
  x: number
  y: number
  turns: number
}

/**
 * Where the pieces start, from the seed: three either side of the frame, in a
 * shuffled order, a little off a neat column, and every one of them turned -
 * a quarter, a half or three quarters. None starts the right way up.
 */
export function planPieces(seed: number): Start[] {
  const random = createRng(hashSeed(seed, 'one-piece:table'))
  const spots: { x: number; y: number }[] = []
  for (const x of [160, TABLE.width - 160]) for (const y of [110, 300, 490]) spots.push({ x, y })
  // Fisher-Yates, from the seed.
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[spots[i], spots[j]] = [spots[j], spots[i]]
  }
  return spots.map((spot) => ({
    x: Math.round(spot.x + (random() - 0.5) * 60),
    y: Math.round(spot.y + (random() - 0.5) * 30),
    turns: 1 + Math.floor(random() * 3),
  }))
}

/* ------------------------------------------------------------------ */
/* The table: yours alone.                                             */
/* ------------------------------------------------------------------ */

export interface Piece {
  /** Its middle, in table units. */
  x: number
  y: number
  /** Quarter turns clockwise off the right way up, 0 to 3. */
  turns: number
  /**
   * Every quarter turn it has ever been given, clockwise positive. Only for
   * drawing: a turn from three quarters to none spins on a quarter rather
   * than all the way back round.
   */
  spin: number
  /** In its place and the right way up. It stays there. */
  locked: boolean
}

export interface Board {
  pieces: Piece[]
  /** Piece indices, back to front. */
  order: number[]
  /** The piece that turning turns, or null. */
  selected: number | null
}

export function newBoard(seed: number): Board {
  return {
    pieces: planPieces(seed).map((s) => ({ x: s.x, y: s.y, turns: s.turns, spin: s.turns, locked: false })),
    order: Array.from({ length: PUZZLE.pieces }, (_, i) => i),
    selected: null,
  }
}

/** Picks a piece up: it is the one selected, and it comes to the front. A piece that is in cannot be. */
export function select(board: Board, index: number): boolean {
  const piece = board.pieces[index]
  if (!piece || piece.locked) return false
  board.selected = index
  board.order = [...board.order.filter((i) => i !== index), index]
  return true
}

export function deselect(board: Board): void {
  board.selected = null
}

/** Keeps a piece's middle where the whole of it stays on the table. */
function clampToTable(piece: Piece): void {
  const half = halfExtent(piece.turns)
  piece.x = Math.min(TABLE.width - half.x, Math.max(half.x, piece.x))
  piece.y = Math.min(TABLE.height - half.y, Math.max(half.y, piece.y))
}

/** Moves a piece's middle to `x`, `y`, as far as the table goes. */
export function moveTo(board: Board, index: number, x: number, y: number): boolean {
  const piece = board.pieces[index]
  if (!piece || piece.locked || !Number.isFinite(x) || !Number.isFinite(y)) return false
  piece.x = x
  piece.y = y
  clampToTable(piece)
  return true
}

/**
 * Clicks a piece into its place if it is near enough and the right way up.
 * Says whether it did.
 */
export function trySnap(board: Board, index: number): boolean {
  const piece = board.pieces[index]
  if (!piece || piece.locked || piece.turns !== 0) return false
  const slot = slotOf(index)
  if (Math.hypot(piece.x - slot.x, piece.y - slot.y) > TABLE.snap) return false
  piece.x = slot.x
  piece.y = slot.y
  piece.locked = true
  if (board.selected === index) board.selected = null
  // In pieces go to the back, under anything still being moved about.
  board.order = [index, ...board.order.filter((i) => i !== index)]
  return true
}

/**
 * Turns a piece a quarter - clockwise for `1`, back for `-1` - about its
 * middle. Turning it the right way up over its place clicks it in. Says
 * whether it clicked in.
 */
export function turn(board: Board, index: number, direction: 1 | -1 = 1): boolean {
  const piece = board.pieces[index]
  if (!piece || piece.locked) return false
  piece.turns = (piece.turns + direction + 4) % 4
  piece.spin += direction
  clampToTable(piece)
  return trySnap(board, index)
}

/** Lets go of a piece where it is. Says whether it clicked in. */
export function drop(board: Board, index: number): boolean {
  return trySnap(board, index)
}

/** Which pieces are in, one bit a piece. */
export function lockedMask(board: Board): number {
  return board.pieces.reduce((mask, piece, i) => (piece.locked ? mask | (1 << i) : mask), 0)
}

export function solved(board: Board): boolean {
  return lockedMask(board) === FULL
}

/* ------------------------------------------------------------------ */
/* The race: what everybody shares.                                    */
/* ------------------------------------------------------------------ */

export interface Player {
  id: string
  mine: boolean
  bot: boolean
  /** Which of their pieces are in, one bit a piece. Everybody can see it. */
  placed: number
  /** Seconds in when the last piece went in, or null. */
  finishedAt: number | null
  left: boolean
}

export interface Game {
  seed: number
  id: number
  /** Seconds since the start. */
  clock: number
  over: boolean
  players: Player[]
}

export interface Entrant {
  id: string
  mine?: boolean
  bot?: boolean
}

export function createGame(seed: number, entrants: readonly Entrant[], id = 1): Game {
  return {
    seed,
    id,
    clock: 0,
    over: entrants.length === 0,
    players: entrants.map((e) => newPlayer(e.id, e.mine ?? false, e.bot ?? false)),
  }
}

export function newPlayer(id: string, mine = false, bot = false): Player {
  return { id, mine, bot, placed: 0, finishedAt: null, left: false }
}

/** How many pieces a mask has in. */
export function countPlaced(mask: number): number {
  let n = 0
  for (let i = 0; i < PUZZLE.pieces; i++) if (mask & (1 << i)) n += 1
  return n
}

export function finished(player: Pick<Player, 'placed'>): boolean {
  return player.placed === FULL
}

/** Seconds left in the game. */
export function timeLeft(game: Pick<Game, 'clock'>): number {
  return Math.max(0, PUZZLE.limit - game.clock)
}

/**
 * Pieces a player has got in. A piece in stays in: the mask only ever gains
 * bits, so a late or repeated word from a guest never takes one back out.
 * The last one in is a finish, at the game's clock. Says whether anything changed.
 */
export function place(game: Game, player: number, mask: number): boolean {
  const p = game.players[player]
  if (!p || p.left || game.over || !Number.isInteger(mask)) return false
  const next = (p.placed | mask) & FULL
  if (next === p.placed) return false
  p.placed = next
  if (finished(p)) p.finishedAt ??= round(game.clock)
  return true
}

/** A player who has left the lobby is not waited for. */
export function leave(game: Game, player: number): void {
  const p = game.players[player]
  if (p) p.left = true
}

/** Whether the game is over: three have finished, everybody still here has, or time is up. Only the host decides. */
export function judgeEnd(game: Game): boolean {
  if (game.over) return true
  const done = game.players.filter((p) => finished(p)).length
  const everybody = game.players.every((p) => p.left || finished(p))
  if (everybody || done >= PUZZLE.podium || game.clock >= PUZZLE.limit) game.over = true
  return game.over
}

/** One step: the clock, and the end. */
export function stepGame(game: Game, dt: number): Game {
  if (game.over) return game
  game.clock = Math.min(PUZZLE.limit, game.clock + Math.min(Math.max(dt, 0), 0.25))
  judgeEnd(game)
  return game
}

/** Everybody, best first: finished soonest, then most pieces in. Level shares a place. */
export function placings(game: Game): { player: Player; index: number; place: number }[] {
  const at = (p: Player) => p.finishedAt ?? Infinity
  // Two who never finished are Infinity apart, which is NaN, which is falsy: on to pieces.
  const better = (a: Player, b: Player) => at(a) - at(b) || countPlaced(b.placed) - countPlaced(a.placed)
  const ranked = game.players.map((player, index) => ({ player, index })).sort((a, b) => better(a.player, b.player))
  return ranked.map((entry) => ({
    ...entry,
    place: 1 + ranked.filter((other) => better(other.player, entry.player) < 0).length,
  }))
}

/** Eight colours that do not look alike, one per player, in roster order. */
export const COLOURS = ['#e8505b', '#3f8fd0', '#f2b33d', '#4fb35a', '#9c4bb0', '#f08a3c', '#35bdbd', '#ef7fb4'] as const

function round(n: number): number {
  return Math.round(n * 100) / 100
}
