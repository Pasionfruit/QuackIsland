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
  createPlayer,
  stepPlayer,
  type PlayerState,
  type PlayerInput,
  type StepOptions,
} from './internal/controller'

export {
  CAM_DISTANCE_MAX,
  CAM_DISTANCE_MIN,
  Player,
  type PlayerProps,
  getPlayerState,
  isCameraOffPlayer,
  refocusCamera,
} from './internal/PlayerView'
