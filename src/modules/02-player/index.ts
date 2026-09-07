/**
 * 02-player - the public contract.
 *
 * A body that walks the island with WASD and jumps with space, and a camera
 * that follows it. Movement resolves against the terrain module's height
 * contract, so the player stands on exactly the ground that is drawn.
 */

export {
  PLAYER,
  IDLE_INPUT,
  createPlayer,
  stepPlayer,
  type PlayerState,
  type PlayerInput,
} from './internal/controller'

export { Player } from './internal/PlayerView'
