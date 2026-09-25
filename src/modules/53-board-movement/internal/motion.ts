import type { BoardMove } from './rules'

export const BOARD_MOTION = {
  tilesPerSecond: 1.5,
  settleBufferMs: 220,
  rollSpinMs: 1_250,
  maxSpinBoost: 10,
  slowestSpinMs: 520,
  fastestSpinMs: 90,
} as const

export function boardMoveDurationMs(move: Pick<BoardMove, 'fromTile' | 'toTile'>): number {
  return boardTravelDurationMs(move.fromTile, move.toTile)
}

export function boardTravelDurationMs(fromTile: number, toTile: number): number {
  const tiles = Math.abs(toTile - fromTile)
  return Math.ceil((tiles / BOARD_MOTION.tilesPerSecond) * 1_000) + BOARD_MOTION.settleBufferMs
}

export function boardDieSpinMs(boost: number): number {
  const clamped = Math.max(1, Math.min(BOARD_MOTION.maxSpinBoost, Math.floor(boost)))
  const range = BOARD_MOTION.slowestSpinMs - BOARD_MOTION.fastestSpinMs
  const progress = (clamped - 1) / (BOARD_MOTION.maxSpinBoost - 1)
  return Math.round(BOARD_MOTION.slowestSpinMs - range * progress)
}
