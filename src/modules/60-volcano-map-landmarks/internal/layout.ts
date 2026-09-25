import { BOARD_TILES, boardPointAt } from '../../53-board-movement'

export type VolcanoLandmarkKind = 'start' | 'progress' | 'summit'

export interface VolcanoLandmark {
  id: string
  kind: VolcanoLandmarkKind
  tileIndex: number
  progress: number
  side: -1 | 0 | 1
  offset: number
  colour: string
}

export interface VolcanoLandmarkPose {
  x: number
  y: number
  z: number
  yaw: number
  tangentX: number
  tangentZ: number
  normalX: number
  normalZ: number
}

const PROGRESS_STOPS = [
  { id: 'lower-ridge', progress: 0.25, side: 1 as const, colour: '#ffd166' },
  { id: 'mid-slope', progress: 0.5, side: -1 as const, colour: '#ff9f43' },
  { id: 'upper-ridge', progress: 0.75, side: 1 as const, colour: '#ff5d3d' },
]

/** The shared, deterministic landmark plan. It contains no player or network state. */
export function createVolcanoLandmarks(tileCount = BOARD_TILES.length): VolcanoLandmark[] {
  const count = Math.max(2, Math.floor(tileCount))
  const last = count - 1

  return [
    {
      id: 'start-gate',
      kind: 'start',
      tileIndex: 0,
      progress: 0,
      side: 0,
      offset: 0,
      colour: '#ffb23f',
    },
    ...PROGRESS_STOPS.map((stop) => ({
      ...stop,
      kind: 'progress' as const,
      tileIndex: Math.round(last * stop.progress),
      offset: 2.55,
    })),
    {
      id: 'summit-beacon',
      kind: 'summit',
      tileIndex: last,
      progress: 1,
      side: -1,
      offset: 2.25,
      colour: '#ff3b1f',
    },
  ]
}

/** Converts a route landmark into a world-space pose beside its tile. */
export function volcanoLandmarkPose(
  landmark: VolcanoLandmark,
  tileCount = BOARD_TILES.length,
): VolcanoLandmarkPose {
  const last = Math.max(1, Math.floor(tileCount) - 1)
  const tileIndex = Math.min(last, Math.max(0, Math.round(landmark.tileIndex)))
  const before = boardPointAt(Math.max(0, tileIndex - 1))
  const point = boardPointAt(tileIndex)
  const after = boardPointAt(Math.min(last, tileIndex + 1))
  const dx = after.x - before.x
  const dz = after.z - before.z
  const length = Math.hypot(dx, dz) || 1
  const tangentX = dx / length
  const tangentZ = dz / length
  const normalX = tangentZ
  const normalZ = -tangentX
  const lateral = landmark.side * landmark.offset

  return {
    x: point.x + normalX * lateral,
    y: point.y,
    z: point.z + normalZ * lateral,
    yaw: Math.atan2(tangentX, tangentZ),
    tangentX,
    tangentZ,
    normalX,
    normalZ,
  }
}

export const VOLCANO_LANDMARKS = createVolcanoLandmarks()

export const VOLCANO_LANDMARK_BUDGET = Object.freeze({
  drawCalls: 5,
  triangles: 302,
})
