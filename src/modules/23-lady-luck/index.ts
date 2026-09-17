/**
 * 23-lady-luck - the public contract.
 *
 * Minigame 11. A meadow of three-leaf clovers with three four-leaf ones hidden
 * in it at a time. Click one to claim it - it is ringed in your colour and
 * nobody else can have it - and another grows somewhere else. A click on
 * anything else costs a second. Most claimed when the minute is up wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { LadyLuckScreen } from './internal/LadyLuckScreen'
import { newGame } from './internal/setup'

registerMinigame('lady-luck', {
  newGame: () => newGame(),
  Panel: LadyLuckScreen,
})

export {
  COLOURS,
  FIELD,
  click,
  cloverAt,
  createGame,
  fieldFor,
  fourLeaf,
  layField,
  placings,
  stepGame,
  timeLeft,
  type Claim,
  type Clover,
  type Entrant,
  type Game,
  type Hunter,
  type Lucky,
  type Outcome,
} from './internal/rules'

export { BOT_MISS_CHANCE, BOT_MISS_EVERY, BOT_SPOTS, botClicks } from './internal/ai'

export { MAX_HUNTERS, ME, SOLO_HUNTERS, gameRoster, myId, newGame, secret, waitingGame, type GameSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Snapshot,
  type WireHunter,
} from './internal/wire'

export { FILL, FOV, HALF, POINTS, TILT, frameScene, groundHit, type Point, type Shot } from './internal/camera'

export { LadyLuckScreen } from './internal/LadyLuckScreen'
