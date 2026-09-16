/**
 * 17-messy-maze - the public contract.
 *
 * Minigame 2. Everybody starts in a different corner of a maze and races for
 * the middle. On the way you must stand on two spinning platforms, and every
 * spin swaps your movement keys for four different letters. You place in the
 * order you reach the middle.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { MessyMazeScreen } from './internal/MessyMazeScreen'
import { newRace } from './internal/setup'

registerMinigame('messy-maze', {
  newGame: () => newRace(),
  Panel: MessyMazeScreen,
})

export {
  HALF,
  MAZE,
  MIDDLE,
  buildMaze,
  cellAt,
  cellCentre,
  exits,
  inWall,
  isOpen,
  mazeFor,
  pushOutOfBox,
  quarterOf,
  rotate,
  routeBetween,
  settle,
  stepsFrom,
  stepsTo,
  type Box,
  type Cell,
  type Maze,
  type Platform,
  type Point,
} from './internal/maze'

export {
  ARROWS,
  LETTERS,
  START_BINDING,
  directionFor,
  heldLetters,
  isBinding,
  rebind,
} from './internal/bindings'

export {
  GOAL,
  RACE,
  createRace,
  goalOpen,
  placings,
  platformsTouched,
  spinnerActive,
  stepRace,
  stillRacing,
  type Entrant,
  type Race,
  type Racer,
} from './internal/race'

export { botDirection, botDirections } from './internal/ai'

export { ME, SOLO_RACERS, myId, newRace, nextSeed, raceRoster, waitingRace, type RaceSetup } from './internal/setup'

export {
  KEYS_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeKeys,
  decodeSnapshot,
  encodeKeys,
  encodeSnapshot,
  type Snapshot,
  type WireRacer,
} from './internal/wire'

export { FILL, FOV, TILT, WALL_HEIGHT, frameMaze, headingToYaw, type Shot } from './internal/camera'

export { MessyMazeScreen } from './internal/MessyMazeScreen'
