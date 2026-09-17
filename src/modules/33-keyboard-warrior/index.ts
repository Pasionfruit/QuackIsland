/**
 * 33-keyboard-warrior - the public contract.
 *
 * Minigame 21. Letters float into the arena one at a time; everybody gets one
 * attempt at each; the fastest right key takes the point; the most points wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { KeyboardWarriorScreen } from './internal/KeyboardWarriorScreen'
import { newGame } from './internal/setup'

registerMinigame('keyboard-warrior', {
  newGame: () => newGame(),
  Panel: KeyboardWarriorScreen,
})

export {
  COLOURS,
  EARLY,
  FLOAT,
  LETTERS,
  ROUND,
  asLetter,
  attempt,
  attemptOf,
  clock,
  createGame,
  fastest,
  judge,
  leave,
  letterFor,
  nextLetter,
  openLetter,
  phase,
  placings,
  stepGame,
  tick,
  type Attempt,
  type Entrant,
  type Game,
  type Letter,
  type Phase,
  type Player,
} from './internal/rules'

export { BOT, botPlan, botType } from './internal/ai'

export { MAX_PLAYERS, ME, SOLO_PLAYERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Snapshot,
  type WireAttempt,
  type WirePlayer,
} from './internal/wire'

export { FILL, FOV, LINE, POINTS, TARGET, TILE, TILT, cameraFor, standPoint } from './internal/camera'

export { KeyboardWarriorScene, PALETTE } from './internal/KeyboardWarriorScene'

export { KeyboardWarriorScreen } from './internal/KeyboardWarriorScreen'
