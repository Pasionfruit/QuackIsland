import { describe, expect, it } from 'vitest'
import { BOARD_TILES } from '../../53-board-movement'
import {
  VOLCANO_LANDMARK_BUDGET,
  createVolcanoLandmarks,
  volcanoLandmarkPose,
  volcanoLandmarksVisible,
} from '..'

describe('volcano map landmarks', () => {
  it('places one start, three climb markers and one summit marker', () => {
    const landmarks = createVolcanoLandmarks(101)

    expect(landmarks.map(({ kind, tileIndex }) => [kind, tileIndex])).toEqual([
      ['start', 0],
      ['progress', 25],
      ['progress', 50],
      ['progress', 75],
      ['summit', 100],
    ])
  })

  it('is stable, ordered and in bounds for the real board', () => {
    const first = createVolcanoLandmarks()
    const second = createVolcanoLandmarks()
    const indices = first.map((landmark) => landmark.tileIndex)

    expect(second).toEqual(first)
    expect(indices).toEqual([...indices].sort((a, b) => a - b))
    expect(new Set(indices).size).toBe(indices.length)
    expect(indices[0]).toBe(0)
    expect(indices[indices.length - 1]).toBe(BOARD_TILES.length - 1)
  })

  it('places side markers away from the route with finite route-relative poses', () => {
    for (const landmark of createVolcanoLandmarks()) {
      const pose = volcanoLandmarkPose(landmark)
      expect(Object.values(pose).every(Number.isFinite)).toBe(true)
      expect(Math.hypot(pose.tangentX, pose.tangentZ)).toBeCloseTo(1, 6)
      expect(Math.hypot(pose.normalX, pose.normalZ)).toBeCloseTo(1, 6)
      expect(pose.tangentX * pose.normalX + pose.tangentZ * pose.normalZ).toBeCloseTo(0, 6)
    }
  })

  it('only appears during an active Volcano Island game', () => {
    expect(volcanoLandmarksVisible('island', 'playing')).toBe(true)
    expect(volcanoLandmarksVisible('island', 'off')).toBe(false)
    expect(volcanoLandmarksVisible('garden', 'playing')).toBe(false)
  })

  it('stays inside its explicit rendering budget', () => {
    expect(VOLCANO_LANDMARK_BUDGET.drawCalls).toBeLessThanOrEqual(6)
    expect(VOLCANO_LANDMARK_BUDGET.triangles).toBeLessThanOrEqual(2500)
  })
})
