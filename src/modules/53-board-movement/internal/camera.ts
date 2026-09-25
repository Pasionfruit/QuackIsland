import { ISLAND } from '../../10-party'
import { boardPointAt, sharedTileOffset } from './position'
import { activeBoardPlayer, boardPosition, type BoardMovementSnapshot } from './rules'

export const BOARD_CAMERA = Object.freeze({
  distance: 6.8,
  height: 4.4,
  focusHeight: 0.82,
  smoothing: 5.5,
})

export interface BoardCameraPose {
  cameraX: number
  cameraY: number
  cameraZ: number
  focusX: number
  focusY: number
  focusZ: number
}

/** The mover keeps the camera until landing; only then does it pass to the next roller. */
export function boardCameraSubject(
  snapshot: BoardMovementSnapshot,
  visualSettled: boolean,
): string | null {
  if (snapshot.phase === 'idle' || snapshot.phase === 'invalid') return null
  const lastMove = snapshot.moves[snapshot.moves.length - 1]
  if (!visualSettled && lastMove) return lastMove.playerId
  if (snapshot.phase === 'won') return snapshot.winnerId || lastMove?.playerId || null
  return activeBoardPlayer(snapshot) ?? lastMove?.playerId ?? null
}

/** Advances a camera's route position at the same measured pace as the board body. */
export function advanceBoardCameraPosition(
  position: number,
  target: number,
  distance: number,
): number {
  if (position < target) return Math.min(target, position + Math.max(0, distance))
  if (position > target) return Math.max(target, position - Math.max(0, distance))
  return target
}

/** Frames a player from outside the volcano, including their shared-tile slot. */
export function boardCameraPose(
  snapshot: BoardMovementSnapshot,
  playerId: string,
  visualPosition: number,
): BoardCameraPose | null {
  const targetTile = boardPosition(snapshot, playerId)
  if (targetTile === null) return null
  const point = boardPointAt(visualPosition)
  const offset = sharedTileOffset(playerId, targetTile, snapshot.turnOrder, snapshot.positions)
  const landingBlend = 1 - Math.min(1, Math.abs(visualPosition - targetTile))
  const focusX = point.x + offset.x * landingBlend
  const focusZ = point.z + offset.z * landingBlend
  const radialX = focusX - ISLAND.centreX
  const radialZ = focusZ - ISLAND.centreZ
  const radialLength = Math.hypot(radialX, radialZ) || 1
  const outwardX = radialX / radialLength
  const outwardZ = radialZ / radialLength

  return {
    cameraX: focusX + outwardX * BOARD_CAMERA.distance,
    cameraY: point.y + BOARD_CAMERA.height,
    cameraZ: focusZ + outwardZ * BOARD_CAMERA.distance,
    focusX,
    focusY: point.y + BOARD_CAMERA.focusHeight,
    focusZ,
  }
}

