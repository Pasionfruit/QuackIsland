/**
 * 65-big-backs-are-near - the public contract.
 *
 * Minigame 41, one-vs-all. One player is the near-sighted Hunter, dropped at
 * the middle of a large procedural corn maze; everybody else is a Hider,
 * scattered from a pen near one edge. The Hunter wins the instant every
 * Hider is caught or gone; the Hiders win as a team the instant the clock
 * runs out with at least one of them still free.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it
 * exists. Importing this module registers it - one line in the composition
 * root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { NearScreen } from './internal/NearScreen'
import { newRound } from './internal/setup'

registerMinigame('big-backs-are-near', {
  newGame: () => newRound(),
  Panel: NearScreen,
})

export { BOT, botSteer } from './internal/ai'

export {
  MAZE,
  MIDDLE,
  blocked,
  cellAt,
  cellCentre,
  clampToField,
  collide,
  deadEnds,
  exits,
  hiderPen,
  hiderSpawn,
  hunterSpawn,
  isOpen,
  lineClear,
  mazeFor,
  nearestCells,
  rayHit,
  slide,
  slideThroughWalls,
  stepsFrom,
  stepsTo,
  type Block,
  type Cell,
  type Maze,
  type Point,
  type Vec3,
} from './internal/maze'

export {
  BODY,
  CATCH,
  COLOURS,
  HEAR_WINDOW,
  HIDER,
  HUNTER,
  PITCH_LIMIT,
  ROUND,
  STRIDE,
  aimDirection,
  canAct,
  catches,
  catchHiders,
  createRound,
  eyeOf,
  hearFootsteps,
  hearingRadius,
  hidersOf,
  hunterOf,
  isStanding,
  judgeEnd,
  leave,
  look,
  report,
  resolveHunter,
  stepRound,
  summarize,
  tick,
  walkHider,
  walkHunter,
  wrapAngle,
  type Entrant,
  type Intent,
  type Ping,
  type Player,
  type Role,
  type Round,
} from './internal/rules'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newRound, nextSeed, waitingRound, type RoundSetup } from './internal/setup'

export {
  MOVE_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeMove,
  decodeSnapshot,
  encodeMove,
  encodeSnapshot,
  type MoveOut,
  type Snapshot,
  type WirePlayer,
} from './internal/wire'

export { NearScene, PALETTE, PITCH, type LookRef } from './internal/NearScene'

export { NearScreen, SENSITIVITY } from './internal/NearScreen'
