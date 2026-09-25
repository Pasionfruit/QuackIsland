import { describe, expect, it } from 'vitest'
import { BOARD_MOTION, boardDieSpinMs, boardMoveDurationMs, boardTravelDurationMs } from '../internal/motion'

describe('board movement presentation timing', () => {
  it('moves at the slower one-and-a-half tile pace and includes a settlement buffer', () => {
    expect(boardMoveDurationMs({ fromTile: 4, toTile: 7 })).toBe(2_000 + BOARD_MOTION.settleBufferMs)
    expect(boardMoveDurationMs({ fromTile: 7, toTile: 7 })).toBe(BOARD_MOTION.settleBufferMs)
    expect(boardTravelDurationMs(7, 4)).toBe(2_000 + BOARD_MOTION.settleBufferMs)
  })

  it('turns repeated clicks into a bounded faster die spin', () => {
    expect(boardDieSpinMs(1)).toBe(BOARD_MOTION.slowestSpinMs)
    expect(boardDieSpinMs(5)).toBeLessThan(boardDieSpinMs(1))
    expect(boardDieSpinMs(BOARD_MOTION.maxSpinBoost)).toBe(BOARD_MOTION.fastestSpinMs)
    expect(boardDieSpinMs(999)).toBe(BOARD_MOTION.fastestSpinMs)
  })
})
