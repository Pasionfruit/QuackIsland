/**
 * 30-synchronize-steps - the public contract.
 *
 * Minigame 19. Everybody on top of a tower twenty steps high, and every two
 * seconds everybody picks 1, 4 or 6. Exactly two on a number both go down that
 * many; three or more on a number all drop eight; alone on a number, you stay.
 * Reach the bottom and you are out; highest at the end wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { SynchronizeStepsScreen } from './internal/SynchronizeStepsScreen'
import { newGame } from './internal/setup'

registerMinigame('synchronize-steps', {
  newGame: () => newGame(),
  Panel: SynchronizeStepsScreen,
})

export {
  COLOURS,
  PHASES,
  TOWER,
  choose,
  createGame,
  leave,
  moveFor,
  onTower,
  placings,
  resolve,
  stepGame,
  type Entrant,
  type Game,
  type Move,
  type Phase,
  type Stepper,
} from './internal/rules'

export { BOT_PICKS, botChoices } from './internal/ai'

export { MAX_STEPPERS, ME, SOLO_STEPPERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  HIDDEN,
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Snapshot,
  type WireStepper,
} from './internal/wire'

export { FILL, FOV, LANES, POINTS, STAIRS, TILT, frameScene, hopAt, laneZ, pointsFor, stepX, stepY, type Shot } from './internal/camera'

export { SynchronizeStepsScreen } from './internal/SynchronizeStepsScreen'
