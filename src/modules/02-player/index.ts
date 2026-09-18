/**
 * 02-player - the public contract.
 *
 * A body that walks the island with WASD and jumps with space, in third
 * person, with the mouse aiming the camera. Movement resolves against the terrain module's height
 * contract, so the player stands on exactly the ground that is drawn.
 */

export {
  PLAYER,
  IDLE_INPUT,
  STUN,
  createPlayer,
  stepPlayer,
  stunFall,
  type PlayerState,
  type PlayerInput,
  type StepOptions,
} from './internal/controller'

export { AVATAR, armPoints, bodyPose, createAvatar, facePoints } from './internal/avatar'

export {
  PLAYER_COLOURS,
  getPlayerColour,
  isPlayerColour,
  setPlayerColour,
  usePlayerColour,
} from './internal/colour'

export {
  VIEW,
  VIEW_MODES,
  clampPitch,
  getViewMode,
  lookDirection,
  placeCamera,
  setViewMode,
  toggleViewMode,
  useViewMode,
  type Placement,
  type RigState,
  type ViewMode,
} from './internal/camera'

export {
  CAM_DISTANCE_MAX,
  CAM_DISTANCE_MIN,
  Player,
  movePlayerTo,
  type PlayerProps,
  getPlayerState,
  isCameraOffPlayer,
  isStunned,
  refocusCamera,
  stunPlayer,
} from './internal/PlayerView'
