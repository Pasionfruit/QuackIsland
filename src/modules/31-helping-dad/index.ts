/**
 * 31-helping-dad - the public contract.
 *
 * Minigame 18. A maze in the dark, and a torch in your own colour on the mouse.
 * Narrow corridors, the whole maze turning slowly under you, and Dad's junk
 * sliding about inside it. Lead it slowly: touch a wall or bump a tin and Dad
 * yells, you drop it and you are stunned for a second and a half. Placed in the
 * order you reach the finish.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { HelpingDadScreen } from './internal/HelpingDadScreen'
import { newGame } from './internal/setup'

registerMinigame('helping-dad', {
  newGame: () => newGame(),
  Panel: HelpingDadScreen,
})

export {
  GRID,
  HALF,
  JUNK,
  ROTATE,
  cellAt,
  cellCentre,
  distanceToFinish,
  intoMaze,
  ON_LINE,
  intoWorld,
  isOpen,
  junkAt,
  mazeAngle,
  mazeFor,
  nextCell,
  routeTarget,
  stepsToFinish,
  touchesJunk,
  touchesWall,
  type Box,
  type Cell,
  type Junk,
  type Maze,
  type Point,
} from './internal/maze'

export {
  COLOURS,
  ROUND,
  TORCH,
  angleOf,
  arrive,
  canMove,
  clock,
  createGame,
  finishPoint,
  hit,
  inJunk,
  judgeEnd,
  leave,
  placings,
  remaining,
  report,
  startPoint,
  steer,
  stepGame,
  tick,
  type Entrant,
  type Game,
  type SteerResult,
  type Torch,
} from './internal/rules'

export { BOT_CARELESS, BOT_PACE, BOT_REACTION, BOT_WANDER, botSteer, botWalk } from './internal/ai'

export { MAX_TORCHES, ME, SOLO_TORCHES, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Snapshot,
  type WireTorch,
} from './internal/wire'

export { DAD, FILL, FOV, HOLD, POINTS, SWEEP, TILT, aimAt, cameraFor, frameScene, type Shot } from './internal/camera'

export { HelpingDadScreen, YELLS } from './internal/HelpingDadScreen'
