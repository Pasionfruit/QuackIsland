/**
 * The rules: where the pieces start, moving and turning them, clicking them in, and who wins.
 */
import { describe, expect, it } from 'vitest'
import {
  FULL,
  PIECE,
  PUZZLE,
  TABLE,
  countPlaced,
  createGame,
  drop,
  finished,
  halfExtent,
  judgeEnd,
  leave,
  lockedMask,
  moveTo,
  newBoard,
  place,
  placings,
  planPieces,
  select,
  slotOf,
  solved,
  stepGame,
  timeLeft,
  turn,
  type Board,
} from '../internal/rules'

const game = () => createGame(4242, [{ id: 'a', mine: true }, { id: 'b' }, { id: 'c' }, { id: 'd' }])

/** Does what a player does: picks piece `i` up, turns it the right way up, and drops it on its place. */
function solve(board: Board, i: number): boolean {
  select(board, i)
  while (board.pieces[i].turns !== 0) turn(board, i, 1)
  const slot = slotOf(i)
  moveTo(board, i, slot.x + 5, slot.y - 5)
  return drop(board, i)
}

describe('the table', () => {
  it('is dealt the same from the same seed, and differently from another', () => {
    expect(planPieces(7)).toEqual(planPieces(7))
    expect(planPieces(7)).not.toEqual(planPieces(8))
  })

  it('starts every piece off the frame, wholly on the table, and turned the wrong way', () => {
    for (let seed = 1; seed < 300; seed++) {
      const starts = planPieces(seed)
      expect(starts).toHaveLength(PUZZLE.pieces)
      for (const s of starts) {
        expect(s.turns).toBeGreaterThanOrEqual(1)
        expect(s.turns).toBeLessThanOrEqual(3)
        const half = halfExtent(s.turns)
        expect(s.x - half.x).toBeGreaterThanOrEqual(0)
        expect(s.x + half.x).toBeLessThanOrEqual(TABLE.width)
        expect(s.y - half.y).toBeGreaterThanOrEqual(0)
        expect(s.y + half.y).toBeLessThanOrEqual(TABLE.height)
        const clear = s.x + half.x <= TABLE.frameX || s.x - half.x >= TABLE.frameX + TABLE.frame
        expect(clear).toBe(true)
      }
    }
  })

  it('puts the places in the frame, two across and three down', () => {
    expect(slotOf(0)).toEqual({ x: TABLE.frameX + PIECE.w / 2, y: TABLE.frameY + PIECE.h / 2 })
    expect(slotOf(5)).toEqual({ x: TABLE.frameX + TABLE.frame - PIECE.w / 2, y: TABLE.frameY + TABLE.frame - PIECE.h / 2 })
  })
})

describe('moving and turning a piece', () => {
  it('brings a piece picked up to the front, and selects it', () => {
    const b = newBoard(1)
    expect(select(b, 2)).toBe(true)
    expect(b.selected).toBe(2)
    expect(b.order[b.order.length - 1]).toBe(2)
  })

  it('keeps the whole of a piece on the table', () => {
    const b = newBoard(1)
    b.pieces[0].turns = 0
    moveTo(b, 0, -500, 9999)
    expect(b.pieces[0].x).toBe(PIECE.w / 2)
    expect(b.pieces[0].y).toBe(TABLE.height - PIECE.h / 2)
  })

  it('turns a quarter at a time, both ways, round and round', () => {
    const b = newBoard(1)
    const was = b.pieces[3].turns
    turn(b, 3, 1)
    expect(b.pieces[3].turns).toBe((was + 1) % 4)
    turn(b, 3, -1)
    turn(b, 3, -1)
    expect(b.pieces[3].turns).toBe((was + 3) % 4)
    expect(b.pieces[3].spin).toBe(was - 1)
  })

  it('does not click in turned the wrong way, however close', () => {
    const b = newBoard(1)
    const slot = slotOf(0)
    b.pieces[0].turns = 2
    moveTo(b, 0, slot.x, slot.y)
    expect(drop(b, 0)).toBe(false)
    expect(b.pieces[0].locked).toBe(false)
  })

  it('does not click in the right way up but in the wrong place', () => {
    const b = newBoard(1)
    b.pieces[0].turns = 0
    const other = slotOf(3)
    moveTo(b, 0, other.x, other.y)
    expect(drop(b, 0)).toBe(false)
  })

  it('clicks in near its place and the right way up, square on, and stays', () => {
    const b = newBoard(1)
    expect(solve(b, 4)).toBe(true)
    expect(b.pieces[4]).toMatchObject({ ...slotOf(4), locked: true })
    expect(b.selected).toBeNull()
    expect(select(b, 4)).toBe(false)
    expect(moveTo(b, 4, 0, 0)).toBe(false)
    expect(turn(b, 4, 1)).toBe(false)
    expect(b.pieces[4].turns).toBe(0)
  })

  it('clicks in when turned the right way up while already over its place', () => {
    const b = newBoard(1)
    const slot = slotOf(1)
    b.pieces[1].turns = 3
    moveTo(b, 1, slot.x, slot.y)
    expect(drop(b, 1)).toBe(false)
    expect(turn(b, 1, 1)).toBe(true)
    expect(b.pieces[1].locked).toBe(true)
  })

  it('is solved when all six are in', () => {
    const b = newBoard(9)
    for (let i = 0; i < PUZZLE.pieces; i++) {
      expect(solved(b)).toBe(false)
      solve(b, i)
      expect(countPlaced(lockedMask(b))).toBe(i + 1)
    }
    expect(lockedMask(b)).toBe(FULL)
    expect(solved(b)).toBe(true)
  })
})

describe('the race', () => {
  it('only ever gains pieces, and finishes on the last', () => {
    const g = game()
    g.clock = 12.345
    expect(place(g, 1, 0b000011)).toBe(true)
    expect(place(g, 1, 0b000001)).toBe(false)
    expect(g.players[1].placed).toBe(0b000011)
    place(g, 1, 0b111100)
    expect(finished(g.players[1])).toBe(true)
    expect(g.players[1].finishedAt).toBe(12.35)
  })

  it('ignores nonsense and anything past six pieces', () => {
    const g = game()
    place(g, 0, 0.5)
    place(g, 0, 1 << 9)
    expect(g.players[0].placed).toBe(0)
  })

  it('ends when three have finished', () => {
    const g = game()
    place(g, 0, FULL)
    place(g, 1, FULL)
    expect(judgeEnd(g)).toBe(false)
    place(g, 2, FULL)
    expect(judgeEnd(g)).toBe(true)
  })

  it('ends when everybody still here has finished', () => {
    const g = createGame(1, [{ id: 'a' }, { id: 'b' }])
    leave(g, 1)
    place(g, 0, FULL)
    stepGame(g, 0.1)
    expect(g.over).toBe(true)
  })

  it('runs to the time limit', () => {
    const g = game()
    for (let i = 0; i < PUZZLE.limit * 10 + 10; i++) stepGame(g, 0.1)
    expect(g.over).toBe(true)
    expect(timeLeft(g)).toBe(0)
  })

  it('places by who finished first, then by pieces in', () => {
    const g = game()
    place(g, 3, 0b000111)
    g.clock = 20
    place(g, 2, FULL)
    g.clock = 31
    place(g, 0, FULL)
    place(g, 1, 0b000001)
    const order = placings(g)
    expect(order.map((e) => e.player.id)).toEqual(['c', 'a', 'd', 'b'])
    expect(order.map((e) => e.place)).toEqual([1, 2, 3, 4])
  })

  it('shares a place when level', () => {
    const g = game()
    place(g, 1, 0b11)
    place(g, 2, 0b101)
    expect(placings(g).map((e) => e.place)).toEqual([1, 1, 3, 3])
  })
})
