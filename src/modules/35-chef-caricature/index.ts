/**
 * 35-chef-caricature - the public contract.
 *
 * Minigame 28. Turn by turn, everybody gets forty-five seconds at the easel to
 * trace as many ingredient and dish outlines as they can while everybody else
 * watches. Three quarters of an outline covered without letting go feeds the
 * hungry duck a point; letting go wipes the attempt. Most dishes wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { ChefCaricatureScreen } from './internal/ChefCaricatureScreen'
import { newGame } from './internal/setup'

registerMinigame('chef-caricature', {
  newGame: () => newGame(),
  Panel: ChefCaricatureScreen,
})

export { OUTLINE_NAMES, SIZE, SPACING, outlineFor, outlineNamed, pointAlong, toOutline, toSegment, type Outline, type Pt } from './internal/outlines'

export {
  COLOURS,
  TRACE,
  TURN,
  coverage,
  createGame,
  currentOutline,
  drawer,
  leave,
  penDown,
  penMove,
  penUp,
  phase,
  placings,
  stepGame,
  tick,
  tidiness,
  timeLeft,
  turnOrder,
  type Entrant,
  type Game,
  type Phase,
  type Player,
  type Stroke,
} from './internal/rules'

export { BOT, botDraw, botPlan } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  INK_TAG,
  MAX_POINTS,
  SNAPSHOT_TAG,
  applyInk,
  applySnapshot,
  decodeInk,
  decodeSnapshot,
  encodeInk,
  encodeSnapshot,
  type Ink,
  type Snapshot,
  type WirePlayer,
} from './internal/wire'

export { BOARD, CHEF, DUCK, FILL, FOV, POINTS, boardPoint, boardToScreen, cameraFor, frameScene, type Shot } from './internal/camera'

export { ChefCaricatureScene, PALETTE } from './internal/ChefCaricatureScene'

export { ChefCaricatureScreen } from './internal/ChefCaricatureScreen'
