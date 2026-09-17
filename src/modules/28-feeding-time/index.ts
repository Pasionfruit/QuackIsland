/**
 * 28-feeding-time - the public contract.
 *
 * Minigame 6. Ducks on a pond, everybody on the bank with crackers. Hold the
 * button and flick the mouse up the screen to throw one - the lean is the aim,
 * the speed is how far. A cracker that lands by a duck feeds it. Most ducks fed
 * at a minute wins.
 *
 * It plugs into `15-minigames` and nothing else in the build knows it exists.
 * Importing this module registers it - one line in the composition root.
 *
 * The exports below are the rules, and they are here because they are worth
 * testing rather than because anybody else needs them.
 */
import { registerMinigame } from '../15-minigames'
import { FeedingTimeScreen } from './internal/FeedingTimeScreen'
import { newGame } from './internal/setup'

registerMinigame('feeding-time', {
  newGame: () => newGame(),
  Panel: FeedingTimeScreen,
})

export {
  COLOURS,
  FLICK,
  POND,
  canThrow,
  createGame,
  duckAt,
  duckCount,
  ducksFor,
  flickToThrow,
  flightTime,
  landing,
  layDucks,
  onPond,
  placings,
  spotOf,
  stepGame,
  throwCracker,
  timeLeft,
  type Cracker,
  type Duck,
  type Entrant,
  type Feeder,
  type Game,
  type Point,
  type Throw,
} from './internal/rules'

export { BOT_AIM, BOT_EVERY, botThrows } from './internal/ai'

export { MAX_FEEDERS, ME, SOLO_FEEDERS, gameRoster, myId, newGame, nextSeed, waitingGame, type GameSetup } from './internal/setup'

export {
  INTENT_TAG,
  SNAPSHOT_TAG,
  applySnapshot,
  decodeIntent,
  decodeSnapshot,
  encodeIntent,
  encodeSnapshot,
  type Snapshot,
  type WireCracker,
  type WireFeeder,
} from './internal/wire'

export { FILL, FOV, POINTS, TILT, frameScene, type Shot } from './internal/camera'

export { FeedingTimeScreen } from './internal/FeedingTimeScreen'
