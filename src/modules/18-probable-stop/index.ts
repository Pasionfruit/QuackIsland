/**
 * 18-probable-stop - the public contract.
 *
 * Minigame 3. Six rounds, three paths each: choose one, change your mind until
 * the countdown ends, and find out which paths hold. Two of three hold in the
 * first four rounds, one of three in the last two. Survive all six.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { ProbableStopScreen } from './internal/ProbableStopScreen'
import { newGame } from './internal/setup'

registerMinigame('probable-stop', {
  newGame: () => newGame(),
  Panel: ProbableStopScreen,
})

export {
  GAME,
  applyIntent,
  choose,
  confirm,
  createGame,
  decideSafe,
  placings,
  roundsSurvived,
  safeCount,
  step,
  stepGame,
  stillIn,
  type Entrant,
  type Game,
  type Intent,
  type Phase,
  type Player,
} from './internal/game'

export { botIntent, botIntents } from './internal/ai'

export { ME, SOLO_PLAYERS, gameRoster, myId, newGame, secret, waitingGame, type GameSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Snapshot,
  type WirePlayer,
} from './internal/wire'

export {
  BEATS,
  BOUNDS,
  PLACE,
  bridgeDrop,
  onGround,
  revealProgress,
  spotFor,
  type Rect,
  type Spot,
} from './internal/place'

export { FILL, FOV, TILT, frameScene, type Shot } from './internal/camera'

export { ProbableStopScreen } from './internal/ProbableStopScreen'
